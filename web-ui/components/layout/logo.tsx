import { cn } from "@/lib/utils";
import Link from "next/link";
import { Badge } from "../ui/badge";

type LogoProps = {
  className?: string;
};

export default function Logo({ className }: LogoProps) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 px-5 py-4 font-bold", className)}>
      <img src="/logo.png" className="block h-5 w-5" alt="shadcn ui kit logo" />
      Shadcn UI Kit <Badge variant="outline">Free</Badge>
    </Link>
  );
}
