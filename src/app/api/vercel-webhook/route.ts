
import crypto from 'crypto';
import { VercelWebhookEvent } from '../../../types';

const { WEBHOOK_INTEGRATION_SECRET, DISCORD_WEBHOOK_URL, VERCEL_TOKEN, VERCEL_TEAM_ID } = process.env;

export const POST = async (req: Request, res: Response) => {
    console.log('=== Webhook received ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Headers:', Object.fromEntries(req.headers.entries()));

    if (typeof WEBHOOK_INTEGRATION_SECRET != 'string') {
        console.error('WEBHOOK_INTEGRATION_SECRET not configured');
        throw new Error('No integration secret found');
    }

    if (typeof DISCORD_WEBHOOK_URL != 'string') {
        console.error('DISCORD_WEBHOOK_URL not configured');
        throw new Error('No Discord webhook URL found');
    }

    console.log('Environment variables loaded successfully');

    const rawBody = await req.text();
    console.log('Raw body length:', rawBody.length);
    console.log('Raw body preview:', rawBody.substring(0, 200));

    const rawBodyBuffer = Buffer.from(rawBody, 'utf-8');

    const bodySignature = sha1(rawBodyBuffer, WEBHOOK_INTEGRATION_SECRET);
    const receivedSignature = req.headers.get('x-vercel-signature');

    console.log('Calculated signature:', bodySignature);
    console.log('Received signature:', receivedSignature);

    if (bodySignature !== receivedSignature) {
        console.error('Signature mismatch!');
        return Response.json({
            code: 'invalid_signature',
            error: "signature didn't match",
        });
    }

    console.log('Signature validation passed');

    const vercelEvent = JSON.parse(rawBodyBuffer.toString('utf-8')) as VercelWebhookEvent;
    console.log('Parsed event type:', vercelEvent.type);
    console.log('Event ID:', vercelEvent.id);
    console.log('Full event:', JSON.stringify(vercelEvent, null, 2));

    try {
        switch (vercelEvent.type) {
            case 'deployment.succeeded':
            case 'deployment.canceled':
            case 'deployment.error':
                console.log('Processing deployment event:', vercelEvent.type);
                await sendDiscordMessageFor(vercelEvent);
                console.log('Discord notification sent successfully');
                break;
            default: ''
                console.log("Ignoring event from Vercel: " + vercelEvent.type);
        }
        console.log('=== Webhook processing complete ===');
        return new Response('Notification sent to Discord.', { status: 200, });
    } catch (error) {
        console.error('=== ERROR during webhook processing ===');
        console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
        console.error('Error message:', error instanceof Error ? error.message : String(error));
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('Full error object:', error);
        return new Response('Internal server error.', { status: 500, });
    }
}

function sha1(data: Buffer, secret: string): string {
    return crypto.createHmac('sha1', secret).update(data).digest('hex');
}

async function fetchVercelBuildLogs(deploymentId: string): Promise<string> {
    if (!VERCEL_TOKEN) {
        console.warn('VERCEL_TOKEN not configured, skipping build logs fetch');
        return 'Build logs unavailable (VERCEL_TOKEN not configured)';
    }

    try {
        console.log('Fetching build logs for deployment:', deploymentId);
        
        const url = VERCEL_TEAM_ID 
            ? `https://api.vercel.com/v3/deployments/${deploymentId}/events?teamId=${VERCEL_TEAM_ID}`
            : `https://api.vercel.com/v3/deployments/${deploymentId}/events`;

        console.log('Vercel API URL:', url);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${VERCEL_TOKEN}`,
            },
        });

        console.log('Vercel API response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to fetch Vercel logs:', errorText);
            return `Failed to fetch build logs: ${response.status}`;
        }

        const data = await response.json();
        console.log('Received', data.length, 'log events');

        const errorLogs = data
            .filter((event: any) => event.type === 'stderr' || event.type === 'error' || (event.type === 'stdout' && event.payload?.text?.toLowerCase().includes('error')))
            .map((event: any) => event.payload?.text || event.text)
            .filter(Boolean)
            .join('\n');

        if (errorLogs) {
            console.log('Found error logs, length:', errorLogs.length);
            return errorLogs.substring(0, 1500);
        }

        const allLogs = data
            .filter((event: any) => event.type === 'stdout' || event.type === 'stderr')
            .slice(-30)
            .map((event: any) => event.payload?.text || event.text)
            .filter(Boolean)
            .join('\n');

        console.log('Using last build logs, length:', allLogs.length);
        return allLogs.substring(0, 1500) || 'No logs available';

    } catch (error) {
        console.error('Error fetching Vercel build logs:', error);
        return 'Error fetching build logs: ' + (error instanceof Error ? error.message : String(error));
    }
}

async function sendDiscordMessageFor(vercelEvent: VercelWebhookEvent) {
    console.log('--- Building Discord message ---');

    const name = vercelEvent.payload.deployment.name;
    const state = vercelEvent.type.split('.')[1].toUpperCase();
    const deploymentDashboardUrl = vercelEvent.payload.links.deployment;
    const projectUrl = vercelEvent.payload.links.project;
    const gitBranch = vercelEvent.payload.deployment.meta["githubCommitRef"];
    const githubOrg = vercelEvent.payload.deployment.meta["githubCommitOrg"];
    const githubCommitRepo = vercelEvent.payload.deployment.meta["githubCommitRepo"];
    const githubCommitSha = vercelEvent.payload.deployment.meta["githubCommitSha"];
    const githubCommitUrl = `https://github.com/${githubOrg}/${githubCommitRepo}/commit/${githubCommitSha}`
    const githubCommitMessage = vercelEvent.payload.deployment.meta["githubCommitMessage"];
    const deploymentId = vercelEvent.payload.deployment.id;

    console.log('Deployment info:', {
        name,
        state,
        gitBranch,
        githubOrg,
        githubCommitRepo,
        githubCommitSha: githubCommitSha?.substring(0, 7),
        githubCommitMessage: githubCommitMessage?.substring(0, 50),
        deploymentId,
    });

    const fields: Array<{ name: string; value: string }> = [
        {
            name: 'Project',
            value: `[${name}](${projectUrl})`,
        },
        {
            name: 'Branch',
            value: gitBranch,
        },
        {
            name: 'Commit',
            value: `[${githubCommitSha}](${githubCommitUrl})`,
        },
        {
            name: 'Commit Message',
            value: githubCommitMessage,
        },
    ];

    if (state === 'ERROR' || state === 'CANCELED') {
        console.log('Fetching build logs for failed deployment...');
        const buildLogs = await fetchVercelBuildLogs(deploymentId);
        
        if (buildLogs && buildLogs.length > 0) {
            fields.push({
                name: 'Build Logs',
                value: '```\n' + buildLogs + '\n```',
            });
        }
    }

    const discordMessage = {
        content: null,
        embeds: [{
            title: `Deployment of ${name} in ${gitBranch.toUpperCase()}: ${state}.`,
            url: deploymentDashboardUrl,
            description: `The deployment for ${name} is now ${state}.`,
            color: state === 'SUCCEEDED' ? 3066993 : 15158332,
            fields,
        }],
    };

    console.log("Discord message payload:", JSON.stringify(discordMessage, null, 2));

    const discordWebhookUrl = DISCORD_WEBHOOK_URL!;
    console.log('Discord webhook URL:', discordWebhookUrl.substring(0, 50) + '...');

    console.log('Sending message to Discord...');
    const response = await fetch(new URL(discordWebhookUrl), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(discordMessage),
    });

    console.log('Discord API response status:', response.status);
    console.log('Discord API response statusText:', response.statusText);

    if (!response.ok) {
        const responseText = await response.text();
        console.error('Discord API error response:', responseText);
        throw new Error(`Discord API returned ${response.status}: ${responseText}`);
    }

    const responseData = await response.text();
    console.log('Discord API response data:', responseData || '(empty response)');
    console.log('--- Discord message sent successfully ---');
}
