import { Button } from "@/components/ui/button";
import { generateMeta } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  return generateMeta({
    title: "404 Error Page",
    description:
      "This is an example of a template for 404 error pages. Built with technologies like Tailwind CSS, Next.js, React and Shadcn.",
  });
}

export default function Error404() {
  return (
    <div className="grid h-screen items-center bg-background pb-8 lg:grid-cols-2 lg:pb-0">
      <div className="text-center">
        <p className="text-base font-semibold text-muted-foreground">404</p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl lg:text-7xl">
          Page not found
        </h1>
        <p className="mt-6 text-base leading-7 text-muted-foreground">
          Sorry, we couldn’t find the page you’re looking for.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-2">
          <Button size="lg">Go back home</Button>
          <Button size="lg" variant="ghost">
            Contact support <ArrowRight className="ms-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="hidden lg:block">
        <img
          src={`/images/404.svg`}
          alt="Login visual"
          className="object-contain"
        />
      </div>
    </div>
  );
}
