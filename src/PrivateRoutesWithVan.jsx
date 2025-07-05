import { useVan } from "./hooks/VanContext";
import VanSelector from "./components/VanSelector";

export default function PrivateRoutesWithVan({ children }) {
  const { van } = useVan();

  if (!van) {
    return <VanSelector />;
  }

  return children;
}
