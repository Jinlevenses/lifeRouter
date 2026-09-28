"use client";

import { use } from "react";
import { CollectionDetail } from "@/components/collections/collection-view";

export default function CollectionPage({ params }: { params: Promise<{ collectionId: string }> }) {
  const { collectionId } = use(params);
  return <CollectionDetail collectionId={collectionId} />;
}
