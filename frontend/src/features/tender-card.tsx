type TenderCardProps = {
  title: string;
  value: number;
  date: string;
  match: number;
  risk: number;
};

export default function TenderCard({
  title,
  value,
  date,
  match,
  risk,
}: TenderCardProps) {
  return (
    <div className="bg-background px-8 py-3 rounded-2xl border-2 border-lightgrey-hover">
      <p className="text-2xl font-bold mb-1 line-clamp-2">{title}</p>
      <div>
        <div className="flex justify-between items-center mb-2">
          <p className="text-2xl">${value}</p>
          <p className="text-lg">Due: {date}</p>
        </div>
        <div className="grid items-center grid-cols-6 justify-between gap-4 text-lg">
          <div className="col-span-1">
            <p>Match</p>
          </div>
          <div className="flex items-center w-full mt-0.5 col-span-5">
            <div
              className={`w-${match}/100 h-1/2 min-h-2 rounded-l-lg bg-green-600`}
            ></div>
            <div
              className={`w-${100 - match}/100 h-1/2 min-h-2 rounded-r-lg bg-lightgrey`}
            ></div>
          </div>
        </div>
        <div className="grid grid-cols-6 items-center justify-between gap-4 text-lg">
          <div className="col-span-1">
            <p>Risk</p>
          </div>
          <div className="flex items-center w-full mt-0.5 col-span-5">
            <div
              className={`w-${risk}/100 h-1/2 min-h-2 rounded-l-lg bg-green-600`}
            ></div>
            <div
              className={`w-${100 - risk}/100 h-1/2 min-h-2 rounded-r-lg bg-lightgrey`}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}
