import Providers from "@/components/providers";

export default function GuestLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <Providers>{children}</Providers>;
}
