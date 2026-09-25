import { AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';

export default function RegistrationLinkRequiredPage() {
  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 text-slate-100">
    <div className="app-auth-bg absolute inset-0" />
    <section className="app-auth-card relative z-10 w-full max-w-md rounded-2xl p-8 text-center">
      <BrandLogo className="mx-auto mb-6 h-auto w-64" />
      <AlertCircle className="mx-auto mb-4 text-amber-400" size={32} />
      <h1 className="text-xl font-semibold text-white">Registration link required</h1>
      <p className="mt-3 text-sm leading-6 text-slate-300">Use the registration link provided to you. The link identifies the correct client service workspace.</p>
      <Link to="/signin" className="mt-6 inline-flex rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-500">Sign in</Link>
    </section>
  </main>;
}
