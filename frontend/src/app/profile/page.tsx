import Header from "@/components/layout/dashboard-header/header";

export default function Profile() {
  return (
    <>
      <Header companyName="Proppy"></Header>
      <main className="flex justify-center bg-lightgrey">
        <div className="w-7/10 bg-background border-2 border-lightgrey-hover rounded-xl"></div>
      </main>
    </>
  );
}
