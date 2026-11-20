// Builds ONE self-contained demo page (account.html in DEMO mode, sample data only) for a preview link.
// Usage: node staging/accounts/build-preview.js <out.html>
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", ".."), read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const LIVE = "https://raymartvalbarez.github.io/adm-portal/";
let html = read("account.html");
const inline = (src) => "<script>\n" + src.replace(/<\/script/gi, "<\\/script") + "\n</script>";
html = html.replace(/<script src="config\.js[^"]*"><\/script>\n/, "<script>var API_URL=\"\";window.ACCT_FORCE_MOCK=true;</script>\n")
  .replace(/<script src="logic\.js[^"]*"><\/script>\n/, "")
  .replace(/<script src="accounts-logic\.js[^"]*"><\/script>/, () => inline(read("accounts-logic.js")))
  .replace(/<script>if\(\/\(\?:\^\|\[\?&\]\)mock=1[^\n]*<\/script>/, () => inline(read("accounts-mock.js")))
  .replace(/<script src="account\.js[^"]*"><\/script>/, () => inline(read("account.js")))
  .replace(/href="index\.html([^"]*)"/g, (m, q) => 'href="' + LIVE + q + '"')
  .replace("<title>My Account", "<title>[PREVIEW] My Account");
if (/<script src=/.test(html)) throw new Error("external script left in preview");
fs.writeFileSync(process.argv[2] || "/workspace/adm-private/accounts/preview.html", html);
console.log("wrote", process.argv[2], html.length, "bytes");
