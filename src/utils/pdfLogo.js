// utils/pdfLogo.js
export async function loadImageAsDataURL(src) {
  // src puede ser /logo.png, /img/logo.svg, etc.
  const res = await fetch(src, { cache: "no-cache" });
  const blob = await res.blob();
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result); // dataURL
    reader.readAsDataURL(blob);
  });
}
