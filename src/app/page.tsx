import Link from "next/link";
import { CalendarDays, Clock, Instagram, MapPin, Utensils } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { money } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let menuDisponible = true;
  const categorias = await prisma.categoriaProducto
    .findMany({
      where: { visible: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      include: {
        productos: {
          where: { activo: true, visibleMenu: true },
          orderBy: { nombre: "asc" }
        }
      }
    })
    .catch(() => {
      menuDisponible = false;
      return [];
    });

  return (
    <main className="public-shell">
      <nav className="topbar">
        <div className="brand">Villa Maria</div>
        <div className="nav-actions">
          <a className="btn ghost" href="#menu">
            <Utensils size={18} /> Menu
          </a>
          <Link className="btn ghost" href="/login">
            Ingresar
          </Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-inner">
          <p className="eyebrow">Bodegon & cafeteria · Mataderos</p>
          <h1>Villa Maria</h1>
          <p>
            Un espacio con alma portena para comer rico, compartir y quedarse un rato mas.
            Platos de bodegon, cafeteria y encuentros sociales en Lisandro de la Torre.
          </p>
          <div className="nav-actions">
            <a className="btn primary" href="#menu">
              Ver menu
            </a>
            <a className="btn ghost" href="#contacto">
              Contacto
            </a>
          </div>
        </div>
      </section>

      <section id="menu" className="public-section">
        <div className="section-head">
          <div>
            <h2>Menu digital</h2>
            <p className="muted">Carta simple, abundante y actualizada desde el sistema interno.</p>
          </div>
        </div>
        {!menuDisponible ? (
          <div className="panel public-empty-state">
            <h3>Menu no disponible momentaneamente</h3>
            <p className="muted">Estamos actualizando la carta. Probá nuevamente en unos minutos.</p>
          </div>
        ) : (
          <div className="menu-grid public-menu-list">
            {categorias.map((categoria) => (
              <details className="panel menu-category" key={categoria.id}>
                <summary>
                  <h3>{categoria.nombre}</h3>
                  <span>{categoria.productos.length} productos</span>
                </summary>
                <div className="menu-category-body">
                  {categoria.productos.length === 0 ? (
                    <p className="muted">Sin productos visibles.</p>
                  ) : (
                    categoria.productos.map((producto) => (
                      <div className="menu-item" key={producto.id}>
                        <div>
                          <strong>{producto.nombre}</strong>
                          <p className="muted">{producto.descripcion}</p>
                        </div>
                        <strong>{money(producto.precio)}</strong>
                      </div>
                    ))
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <section id="contacto" className="public-section">
        <div className="cards-grid">
          <div className="card">
            <h3>
              <MapPin size={18} /> Ubicacion
            </h3>
            <p className="muted">Lisandro de la Torre 2331, Caba, Mataderos.</p>
          </div>
          <div className="card">
            <h3>
              <Clock size={18} /> Horarios
            </h3>
            <p className="muted">Martes a viernes de 9 a 15 hs. Sabados y domingos de 9 hs en adelante.</p>
          </div>
          <div className="card">
            <h3>
              <CalendarDays size={18} /> Encuentros
            </h3>
            <p className="muted">Espacio de encuentro social, eventos, meriendas y propuestas culturales.</p>
          </div>
          <div className="card">
            <h3>
              <Instagram size={18} /> Instagram
            </h3>
            <p className="muted">@villamaria.mtd</p>
          </div>
        </div>
      </section>
    </main>
  );
}
