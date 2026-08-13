import './globals.css';

export const metadata = {
  title: 'DJ Ramp — Deluxe Salon Light Desk',
  description:
    'A bus-salon DJ ramp: moving heads, PAR cans, lasers, strobes and fog on a live control desk, with a themed music player, queue, lyrics and search. Made by Priyanshu Raj.',
  authors: [{ name: 'Priyanshu Raj' }],
};

export const viewport = {
  themeColor: '#04050a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
