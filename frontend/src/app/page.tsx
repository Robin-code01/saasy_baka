import Image from "next/image";

export default function Home() {
  return (
    <>
      <div className="my-10 mx-10 flex">
        <div className="flex items-center justify-center h-60 aspect-square bg-background">
          <p className="text-2xl text-foreground">Background Color</p>
        </div>
        <div className="flex items-center justify-center h-60 aspect-square bg-lightgrey">
          <p className="text-2xl text-foreground">Primary Color</p>
        </div>
      </div>
    </>
  );
}
