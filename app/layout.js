import './globals.css';

export const metadata = {
  title: 'SYNORA — Reactive Music & Lighting Experience',
  description:
    'A reactive music and lighting experience: moving heads, PAR cans, lasers, strobes and fog on a live control desk, with a themed music player, queue, lyrics and search. Made by Priyanshu Raj.',
  authors: [{ name: 'Priyanshu Raj' }],
  applicationName: 'SYNORA',
  openGraph: {
    title: 'SYNORA — Reactive Music & Lighting Experience',
    description:
      'Six themed scenes, a full stage rig you can operate, and a music deck with queue, search and timed lyrics.',
    siteName: 'SYNORA',
    type: 'website',
  },
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
