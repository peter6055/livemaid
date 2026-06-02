import Dashboard from '@/components/Dashboard';

export default function Home() {
  const isDemo = process.env.DEMO_MODE === 'true';
  return <Dashboard isDemo={isDemo} />;
}
