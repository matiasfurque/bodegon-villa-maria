"use client";

import { useState } from "react";
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
  const [selectedId, setSelectedId] = useState<number | null>(categorias.find((categoria) => categoria.productos.length > 0)?.id ?? categorias[0]?.id ?? null);
  const selected = categorias.find((categoria) => categoria.id === selectedId) ?? categorias[0];

  if (!selected) {
    return <p className="digital-menu-empty">La carta se está preparando. Volvé a visitarnos pronto.</p>;
  }

  return (
    <div className="digital-menu">
      <nav className="digital-menu-categories" aria-label="Categorías del menú">
        {categorias.map((categoria) => (
          <button
            className={`digital-menu-chip${categoria.id === selected.id ? " is-active" : ""}`}
            type="button"
            key={categoria.id}
            aria-pressed={categoria.id === selected.id}
            onClick={() => setSelectedId(categoria.id)}
          >
            <span>{categoria.nombre}</span>
            <small>{categoria.productos.length}</small>
          </button>
        ))}
      </nav>

      <div className="digital-menu-selection" aria-live="polite">
        <div>
          <p className="digital-menu-selection-label">En nuestra carta</p>
          <h3>{selected.nombre}</h3>
        </div>
        <span>{selected.productos.length} {selected.productos.length === 1 ? "producto" : "productos"}</span>
      </div>

      {selected.productos.length === 0 ? (
        <p className="digital-menu-empty">No hay productos disponibles en esta categoría por el momento.</p>
      ) : (
        <div className="digital-menu-products" key={selected.id}>
          {selected.productos.map((producto) => (
            <article className="digital-menu-product" key={producto.id}>
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
