import { Suspense } from "react";
import Portal from "@/components/placepro/portal";
export default function Home() {
  return <Suspense fallback={<div className="p-8">Loading PlacePro...</div>}><Portal /></Suspense>;
}
