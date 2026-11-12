import { useEffect, useState } from "react";

/**
 * Devuelve `valor` pero recién después de que dejó de cambiar durante `delay` ms.
 * Útil para no disparar una query (p. ej. sugerencias) en cada tecla.
 */
export function useDebounce<T>(valor: T, delay = 250): T {
  const [debounced, setDebounced] = useState(valor);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(valor), delay);
    return () => clearTimeout(id);
  }, [valor, delay]);
  return debounced;
}
