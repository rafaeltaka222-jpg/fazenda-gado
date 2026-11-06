"use client";
import JRLogo from "./JRLogo";

export default function BullLogo({
  size = 40,
  className = "",
  showSubtitle = false,
}: {
  size?: number | string;
  className?: string;
  showSubtitle?: boolean;
}) {
  return <JRLogo size={size} className={className} showSubtitle={showSubtitle} />;
}
