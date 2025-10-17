export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-zinc-900 text-zinc-100">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">Vercel → Discord</h1>
          <p className="text-zinc-400 text-lg">
            Webhook bridge for Vercel deployment notifications
          </p>
        </div>

        <div className="bg-zinc-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold">Features</h2>
          <ul className="space-y-2 text-zinc-300">
            <li>→ Deployment status notifications</li>
            <li>→ Build logs on failures</li>
            <li>→ Commit info & links</li>
          </ul>
        </div>

        <div className="bg-zinc-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold">Endpoint</h2>
          <code className="block bg-zinc-900 p-3 rounded text-sm text-zinc-300">
            /api/vercel-webhook
          </code>
        </div>
      </div>
    </main>
  )
}
