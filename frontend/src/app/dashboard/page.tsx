import { SessionGate } from "@/components/auth/session-gate";
import { Header } from "@/components/layout/dashboard-header/header";

export default function Dashboard() {
  return (
    <SessionGate mode="auth">
      <Header companyName="some company" />
      <main className="grid bg-lightgrey h-[calc(100vh-64px)] w-full pt-10 grid-cols-6 gap-10 px-10">
        <div className="bg-lightgrey h-full col-span-2">
          <div className="bg-background px-8 py-3 rounded-2xl border-2 border-lightgrey-hover">
            <p className="text-2xl font-bold mb-1 line-clamp-2">
              Lorem ipsum dolor sit amet consectetur, adipisicing elit.
              Aspernatur, velit.
            </p>
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-2xl">$200,000</p>
                <p className="text-lg">Due: 26/9/2026</p>
              </div>
              <div className="grid items-center grid-cols-6 justify-between gap-4 text-lg">
                <div className="col-span-1">
                  <p>Match</p>
                </div>
                <div className="flex items-center w-full mt-0.5 col-span-5">
                  <div
                    className={`w-70/100 h-1/2 min-h-2 rounded-l-lg bg-green-600`}
                  ></div>
                  <div
                    className={`w-30/100 h-1/2 min-h-2 rounded-r-lg bg-lightgrey`}
                  ></div>
                </div>
              </div>
              <div className="grid grid-cols-6 items-center justify-between gap-4 text-lg">
                <div className="col-span-1">
                  <p>Risk</p>
                </div>
                <div className="flex items-center w-full mt-0.5 col-span-5">
                  <div
                    className={`w-20/100 h-1/2 min-h-2 rounded-l-lg bg-green-600`}
                  ></div>
                  <div
                    className={`w-80/100 h-1/2 min-h-2 rounded-r-lg bg-lightgrey`}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-lightgrey h-full col-span-4"></div>
      </main>
    </SessionGate>
  );
}
