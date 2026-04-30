import "./globals.css";

export const metadata = {
  title: "POJOK 3D",
  description: "Clone Dance Video"
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
