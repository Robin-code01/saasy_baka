import { SessionGate } from "@/components/auth/session-gate";
import { Header } from "@/components/layout/dashboard-header/header";
import TenderCard from "@/features/tender-card";

export default function Dashboard() {
  return (
    <SessionGate mode="auth">
      <Header companyName="Proppy" />
      <main className="grid bg-lightgrey h-[calc(100vh-64px)] w-full pt-10 grid-cols-6 gap-10 px-30">
        <div className="bg-lightgrey h-full col-span-2 overflow-y-auto custom-scrollbar">
          <TenderCard
            title="Lorem ipsum gor gaonga ganrgo npogra og regraenoe rngoao arengoaemoa"
            value={200000}
            date="26/9/2026"
            match={70}
            risk={20}
          ></TenderCard>
          <TenderCard
            title="Lorem ipsum gor gaonga ganrgo npogra og regraenoe rngoao arengoaemoa"
            value={200000}
            date="26/9/2026"
            match={70}
            risk={20}
          ></TenderCard>
          <TenderCard
            title="Lorem ipsum gor gaonga ganrgo npogra og regraenoe rngoao arengoaemoa"
            value={200000}
            date="26/9/2026"
            match={70}
            risk={20}
          ></TenderCard>
          <TenderCard
            title="Lorem ipsum gor gaonga ganrgo npogra og regraenoe rngoao arengoaemoa"
            value={200000}
            date="26/9/2026"
            match={70}
            risk={20}
          ></TenderCard>
          <TenderCard
            title="Lorem ipsum gor gaonga ganrgo npogra og regraenoe rngoao arengoaemoa"
            value={200000}
            date="26/9/2026"
            match={70}
            risk={20}
          ></TenderCard>
          <TenderCard
            title="Lorem ipsum gor gaonga ganrgo npogra og regraenoe rngoao arengoaemoa"
            value={200000}
            date="26/9/2026"
            match={70}
            risk={20}
          ></TenderCard>
          <TenderCard
            title="Lorem ipsum gor gaonga ganrgo npogra og regraenoe rngoao arengoaemoa"
            value={200000}
            date="26/9/2026"
            match={70}
            risk={20}
          ></TenderCard>
        </div>
        <div className="flex justify-center bg-background border-2 border-lightgrey-hover rounded-2xl h-full col-span-4 overflow-hidden">
          <div className="overflow-y-auto custom-scrollbar py-8 px-12">
            <h1 className="text-4xl font-bold mb-12">
              Lorem ipsum gor gaonga ganrgo npogra og regraenoe rngoao
              arengoaemoaggano
            </h1>
            <h2 className="text-3xl font-semibold mb-4">Description</h2>
            <p className="text-xl mb-10">
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Iure
              optio quas exercitationem corrupti saepe! Laborum facilis mollitia
              amet doloremque? Perspiciatis quasi fugit optio nobis molestias
              minima mollitia magni dicta harum iure? Expedita quaerat eveniet
              molestiae dolor eum veritatis? Nostrum expedita eius officiis
              ipsum, dolore quaerat quae nemo, debitis voluptates eaque unde
              similique esse magni. Eius nam alias nulla nobis non sunt, qui,
              laboriosam necessitatibus quam impedit architecto soluta iusto
              rerum molestias a, quas molestiae sapiente recusandae! Corporis
              eum, velit voluptas quidem distinctio sunt natus, provident
              dolorum recusandae, aspernatur ad tempora error asperiores.
              Eligendi est repellendus ut error ipsa nisi laboriosam.
            </p>
            <h2 className="text-3xl font-semibold mb-4">Total Value</h2>
            <p className="text-xl mb-10">$200000</p>
            <h2 className="text-3xl font-semibold mb-4">Deadline</h2>
            <p className="text-xl mb-10">26th September 2026</p>
            <h2 className="text-3xl font-semibold mb-4">Document</h2>
            <p className="text-xl mb-10">https://whatever.com</p>
          </div>
        </div>
      </main>
    </SessionGate>
  );
}
