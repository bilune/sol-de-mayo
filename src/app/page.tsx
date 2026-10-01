import ClientApp from './ClientApp'

export default function Page() {
  // `#app` is the root the stylesheet is written against (clipping, heights).
  return (
    <div id="app">
      <ClientApp />
    </div>
  )
}
