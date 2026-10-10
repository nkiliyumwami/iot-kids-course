export const metadata = { title: 'KundaKode Flasher', description: 'Compile and flash ESP32 code from the browser' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#E3EBF0', color: '#15202A' }}>{children}</body>
    </html>
  );
}
