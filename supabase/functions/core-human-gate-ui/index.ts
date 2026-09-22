// DEV only. Auth and approvals remain in Core; HTML is served by the existing DEV frontend.
Deno.serve((req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method Not Allowed", {status:405,headers:{Allow:"GET, HEAD"}});
  return new Response(null, {status:302,headers:{
    Location:"https://xicronix-commercial-intelligence-git-dev-xicronix.vercel.app/core-human-gate.html",
    "Cache-Control":"no-store",
    "Referrer-Policy":"no-referrer",
    "X-Content-Type-Options":"nosniff"
  }});
});
