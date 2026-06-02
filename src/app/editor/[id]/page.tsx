import LiveMaidEditor from '@/components/LiveMaidEditor';

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isDemo = process.env.DEMO_MODE === 'true';
  return <LiveMaidEditor documentId={id} isDemo={isDemo} />;
}
