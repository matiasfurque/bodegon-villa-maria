import Link from "next/link";
import { CalendarDays, Clock, Instagram, MapPin, Utensils } from "lucide-react";
import { prisma } from "@/lib/prisma";
import PublicMenu from "./public-menu";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let menuDisponible = true;
  const categorias = await prisma.categoriaProducto
    .findMany({
      where: { estado: { visibleEnMenu: true, habilitado: true } },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      select: {
        id: true,
        nombre: true,
        productos: {
          where: {
            estado: { permiteVenta: true },
            visibilidad: { visibleEnMenu: true }
          },
          orderBy: { nombre: "asc" },
          select: { id: true, nombre: true, descripcion: true, precio: true }
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
        <div className="brand">Bodegon Villa Maria</div>
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
            <p className="digital-menu-eyebrow">Nuestra carta</p>
            <h2>Menú digital</h2>
            <p className="muted">Elegí una categoría y descubrí los sabores de Villa María.</p>
          </div>
        </div>
        {!menuDisponible ? (
          <div className="panel public-empty-state">
            <h3>Menu no disponible momentaneamente</h3>
            <p className="muted">Estamos actualizando la carta. Probá nuevamente en unos minutos.</p>
          </div>
        ) : (
          <PublicMenu categorias={categorias.map((categoria) => ({
            id: categoria.id,
            nombre: categoria.nombre,
            productos: categoria.productos.map((producto) => ({
              id: producto.id,
              nombre: producto.nombre,
              descripcion: producto.descripcion,
              precio: producto.precio?.toString() ?? null
            }))
          }))} />
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
