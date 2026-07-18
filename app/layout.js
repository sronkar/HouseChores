import "./globals.css";

export const metadata = {
  title: "HouseChores",
  description: "Family chores, points & streaks",
  applicationName: "HouseChores",
  appleWebApp: {
    capable: true,        // fullscreen standalone when added to the iPad home screen
    title: "HouseChores",
    statusBarStyle: "default",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f4f6fb",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
