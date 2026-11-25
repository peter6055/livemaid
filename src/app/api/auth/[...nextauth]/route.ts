import { handlers } from "@/lib/auth";
import { withAppBasePath } from "@/lib/auth/withAppBasePath";

export const GET = withAppBasePath(handlers.GET);
export const POST = withAppBasePath(handlers.POST);
