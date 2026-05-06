import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";

export const metadata = { title: "Contact Us — Hawkeye Sterling" };

export default function ContactPage() {
  return (
    <ModuleLayout>
      <ModuleHero
        eyebrow="SUPPORT & ENQUIRIES"
        title="Contact"
        titleEm="us."
        intro="Reach the Hawkeye Sterling compliance team for technical support, licensing, regulatory enquiries, or to report an issue."
      />

      <div className="max-w-2xl space-y-6 mt-6">
        <ContactBlock
          title="Technical Support"
          detail="For platform issues, access problems, or bug reports."
          email="support@hawkeyesterling.com"
          response="Response within 4 business hours (Dubai time)"
        />
        <ContactBlock
          title="Compliance & Regulatory Enquiries"
          detail="MLRO consultation, regulatory guidance, or FDL / FATF questions."
          email="compliance@hawkeyesterling.com"
          response="Response within 1 business day"
        />
      </div>
    </ModuleLayout>
  );
}

function ContactBlock({
  title,
  detail,
  email,
  response,
}: {
  title: string;
  detail: string;
  email: string;
  response: string;
}) {
  return (
    <div className="border border-hair-2 rounded-xl p-5 bg-bg-panel space-y-2">
      <div className="text-13 font-semibold text-ink-0">{title}</div>
      <div className="text-12 text-ink-2">{detail}</div>
      <a
        href={`mailto:${email}`}
        className="inline-block text-12 font-mono text-brand hover:underline"
      >
        {email}
      </a>
      <div className="text-10 text-ink-3 font-mono pt-0.5">{response}</div>
    </div>
  );
}
