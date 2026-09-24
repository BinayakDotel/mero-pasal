"use client";

import { useParams } from "next/navigation";
import { BillScreen } from "@/features/bills/bill-screen";

export default function BillPage() {
  const { clientId } = useParams<{ clientId: string }>();
  return <BillScreen clientId={decodeURIComponent(clientId)} />;
}
