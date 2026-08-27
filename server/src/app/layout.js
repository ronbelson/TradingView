export const metadata = {
  title: 'BTC CHEF',
  description: 'BTC CHEF · multi-timeframe trading scene from TradingView',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
          background: '#0d1117',
          color: '#e6edf3',
        }}
      >
        {children}
      </body>
    </html>
  );
}
