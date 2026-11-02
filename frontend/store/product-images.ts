
const PRODUCT_IMAGES: Record<string, string> = {
  "Cà phê sữa": "/images/ca-phe-sua.jpg",
  "Americano": "/images/americano.jpg",
  "Cappuccino": "/images/cappuccino.jpg",
  "Trà đào": "/images/tra-dao.jpg",
};

export function getProductImage(
  name: string,
  originalUrl?: string | null
): string {
  return (
    PRODUCT_IMAGES[name.trim()] ??
    originalUrl?.trim() ??
    "/favicon.svg"
  );
}
