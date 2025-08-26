export default function LoadingSkeleton({ componentName }: { componentName: string }) {
  return (
    <div className="w-full max-w-5xl h-[600px] mx-auto bg-black text-white font-mono border-2 border-white flex flex-col items-center justify-center">
      <div className="text-green-400 text-lg">LOADING COMPONENT...</div>
      <div className="text-white text-2xl font-bold my-4">{componentName}</div>
      <div className="flex items-center text-green-400">
        <span>INITIALIZING</span>
        <div className="w-3 h-5 bg-green-400 ml-2 animate-pulse"></div>
      </div>
      <div className="mt-8 text-xs text-gray-500 w-1/2 text-center">
        <p>Please wait while the component and its resources are being loaded. This ensures a smooth experience without overloading the system.</p>
      </div>
    </div>
  )
}
