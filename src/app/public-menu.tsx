"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { money } from "@/lib/money";

type MenuProduct = {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: string | null;
};

type MenuCategory = {
  id: number;
  nombre: string;
  productos: MenuProduct[];
};

function productPrice(precio: string | null) {
  if (precio === null || precio.trim() === "") return "Consultar precio";
  const amount = Number(precio);
  return Number.isFinite(amount) && amount >= 0 ? money(amount) : "Consultar precio";
}

export default function PublicMenu({ categorias }: { categorias: MenuCategory[] }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const activeTransition = useRef<ViewTransition | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [transitionMode, setTransitionMode] = useState<"initial" | "native" | "fallback">("initial");
  const [selectedId, setSelectedId] = useState<number | null>(categorias.find((categoria) => categoria.productos.length > 0)?.id ?? categorias[0]?.id ?? null);
  const selected = categorias.find((categoria) => categoria.id === selectedId) ?? categorias[0];

  useEffect(() => {
    const section = menuRef.current?.closest("#menu");
    if (!section || !window.IntersectionObserver || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setIsVisible(true);
      observer.disconnect();
    }, { rootMargin: "0px 0px -10% 0px" });

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => activeTransition.current?.skipTransition(), []);

  function selectCategory(id: number) {
    if (id === selectedId) return;

    activeTransition.current?.skipTransition();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !document.startViewTransition) {
      setTransitionMode("fallback");
      setSelectedId(id);
      return;
    }

    const transition = document.startViewTransition(() => {
      flushSync(() => {
        setTransitionMode("native");
        setSelectedId(id);
      });
    });
    activeTransition.current = transition;
    void transition.finished.finally(() => {
      if (activeTransition.current === transition) activeTransition.current = null;
    });
  }

  if (!selected) {
    return <p className="digital-menu-empty">La carta se está preparando. Volvé a visitarnos pronto.</p>;
  }

  return (
    <div className={`digital-menu${isVisible ? " is-visible" : ""}`} data-transition-mode={transitionMode} ref={menuRef}>
      <div className="digital-menu-guide" aria-hidden="true"><span>EXPLORÁ LA CARTA</span><span>{String(categorias.length).padStart(2, "0")} CATEGORÍAS</span></div>
      <nav className="digital-menu-categories" aria-label="Categorías del menú">
        {categorias.map((categoria, index) => (
          <button
            className={`digital-menu-chip${categoria.id === selected.id ? " is-active" : ""}`}
            type="button"
            key={categoria.id}
            style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
            aria-pressed={categoria.id === selected.id}
            aria-controls="menu-products"
            onClick={() => selectCategory(categoria.id)}
          >
            {categoria.id === selected.id && <i className="digital-menu-active-marker" aria-hidden="true" />}
            <span>{categoria.nombre}</span>
            <small>{categoria.productos.length}</small>
          </button>
        ))}
      </nav>

      <div className="digital-menu-selection" aria-live="polite">
        <div className="digital-menu-selection-copy" key={selected.id}>
          <p className="digital-menu-selection-label">SELECCIÓN {String(categorias.findIndex((categoria) => categoria.id === selected.id) + 1).padStart(2, "0")} / {String(categorias.length).padStart(2, "0")}</p>
          <h3>{selected.nombre}</h3>
        </div>
        <span>{selected.productos.length} {selected.productos.length === 1 ? "producto" : "productos"}</span>
      </div>

      {selected.productos.length === 0 ? (
        <p className="digital-menu-empty" id="menu-products">No hay productos disponibles en esta categoría por el momento.</p>
      ) : (
        <div className="digital-menu-products" id="menu-products" key={selected.id}>
          {selected.productos.map((producto, index) => (
            <article className="digital-menu-product" key={producto.id} style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}>
              <span className="digital-menu-product-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div className="digital-menu-product-copy">
                <h4>{producto.nombre}</h4>
                {producto.descripcion && <p>{producto.descripcion}</p>}
              </div>
              <strong className="digital-menu-price">{productPrice(producto.precio)}</strong>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
