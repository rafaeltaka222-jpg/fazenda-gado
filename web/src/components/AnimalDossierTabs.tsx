"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function AnimalDossierTabs({
  historyPane,
  weighingsPane,
  vaccinesPane,
  reproductionPane,
  movementsPane,
  editPane,
  earTag,
}: {
  historyPane: React.ReactNode;
  weighingsPane: React.ReactNode;
  vaccinesPane: React.ReactNode;
  reproductionPane: React.ReactNode;
  movementsPane: React.ReactNode;
  editPane: React.ReactNode;
  earTag: string;
}) {
  const [activeTab, setActiveTab] = useState<
    "historico" | "pesagens" | "vacinas" | "reproducao" | "movimentacoes" | "editar"
  >("historico");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Barra de Abas Fiel à Imagem 2 */}
      <div className="animal-tabs-bar">
        <button
          type="button"
          onClick={() => setActiveTab("historico")}
          className={`animal-tab-btn ${activeTab === "historico" ? "active" : ""}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Histórico</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("pesagens")}
          className={`animal-tab-btn ${activeTab === "pesagens" ? "active" : ""}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
          </svg>
          <span>Pesagens</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("vacinas")}
          className={`animal-tab-btn ${activeTab === "vacinas" ? "active" : ""}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <span>Vacinas</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("reproducao")}
          className={`animal-tab-btn ${activeTab === "reproducao" ? "active" : ""}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span>Reprodução</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("movimentacoes")}
          className={`animal-tab-btn ${activeTab === "movimentacoes" ? "active" : ""}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <span>Movimentações</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("editar")}
          className={`animal-tab-btn ${activeTab === "editar" ? "active" : ""}`}
          style={{ marginLeft: "auto" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span>Editar Cadastro</span>
        </button>
      </div>

      {/* Conteúdo da Aba Selecionada */}
      <div>
        {activeTab === "historico" && historyPane}
        {activeTab === "pesagens" && weighingsPane}
        {activeTab === "vacinas" && vaccinesPane}
        {activeTab === "reproducao" && reproductionPane}
        {activeTab === "movimentacoes" && movementsPane}
        {activeTab === "editar" && editPane}
      </div>

      {/* Rodapé de Ações Fiel à Imagem 2 (Imprimir Ficha + Exportar PDF) */}
      <div
        className="noprint"
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 12,
          paddingTop: 8,
        }}
      >
        <button
          type="button"
          onClick={() => window.print()}
          className="btn ghost"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            fontSize: 13.5,
            fontWeight: 600,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          <span>Imprimir Ficha</span>
        </button>

        <Link
          href={`/api/reports/export?format=pdf&source=animals&q=${encodeURIComponent(earTag)}`}
          className="btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            fontSize: 13.5,
            fontWeight: 700,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span>Exportar PDF</span>
        </Link>
      </div>
    </div>
  );
}
