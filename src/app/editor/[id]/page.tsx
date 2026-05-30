import LiveMaidEditor from '@/components/LiveMaidEditor';

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveMaidEditor documentId={id} />;
}
