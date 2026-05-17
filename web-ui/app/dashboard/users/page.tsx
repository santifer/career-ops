import { promises as fs } from "fs";
import path from "path";
import { Metadata } from "next";
import { generateMeta } from "@/lib/utils";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlusCircledIcon } from "@radix-ui/react-icons";
import UsersDataTable from "./data-table";
import { Card, CardContent } from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata>{
  return generateMeta({
    title: "Users",
    description:
      "A list of users created using the Tanstack Table. Tailwind is built on CSS and React.",
  });
}

async function getUsers() {
  const data = await fs.readFile(path.join(process.cwd(), "app/dashboard/users/data.json"));
  return JSON.parse(data.toString());
}

export default async function Page() {
  const users = await getUsers();

  return (
    <>
      <div className="flex items-center justify-between ">
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <Button variant="secondary" asChild>
          <Link href="#">
            <PlusCircledIcon /> Add New User
          </Link>
        </Button>
      </div>
      <Card>
        <CardContent>
          <UsersDataTable data={users} />
        </CardContent>
      </Card>
    </>
  );
}
