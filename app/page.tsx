import { AboutSection } from '@/components/landing/about-section';
import { ContactCTA } from '@/components/landing/contact-cta';
import { HeroSection } from '@/components/landing/hero-section';
import { LandingFooter } from '@/components/landing/landing-footer';
import { LandingHeader } from '@/components/landing/landing-header';
import { PartnersShowcase } from '@/components/landing/partners-showcase';
import { ServicesGrid } from '@/components/landing/services-grid';

export default function Home() {
  return (
    <>
      <LandingHeader />
      <main>
        <HeroSection />
        <ServicesGrid />
        <AboutSection />
        <PartnersShowcase />
        <ContactCTA />
      </main>
      <LandingFooter />
    </>
  );
}
