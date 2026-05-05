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
        <ContactBlock
          title="Commercial & Licensing"
          detail="New licences, renewals, enterprise pricing, or data partnerships."
          email="sales@hawkeyesterling.com"
          response="Response within 1 business day"
        />
        <ContactBlock
          title="Data Subject Requests"
          detail="Access, correction, or erasure requests under UAE Data Protection Law."
          email="dpo@hawkeyesterling.com"
          response="Acknowledged within 2 business days · resolved within 30 days"
        />

        <div className="border border-hair-2 rounded-xl p-5 bg-bg-panel text-12 text-ink-2 space-y-1">
          <div className="text-11 uppercase tracking-wide-3 text-ink-3 font-medium mb-2">Registered address</div>
          <div className="text-ink-1">Hawkeye Sterling FZE</div>
          <div>DMCC Free Zone, Dubai, United Arab Emirates</div>
          <div className="text-10 text-ink-3 pt-1">Regulated under UAE Federal Decree-Law No. 20/2018 (AML Law) and Cabinet Decision No. 10/2019.</div>
        </div>
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
