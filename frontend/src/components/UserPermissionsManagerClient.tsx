"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { usePermissionsStore, type Permission } from "@/hooks/usePermissionsStore";
import { Spinner } from "@/components/ui/Spinner";

export interface UserPermissionsManagerProps {
  userId: string;
  showCategories?: boolean;
  isReadOnly?: boolean;
  onPermissionsChange?: (permissions: Permission[]) => Promise<void> | void;
}

const CATEGORY_ORDER: Permission["category"][] = [
  "payment",
  "webhook",
  "analytics",
  "admin",
];

const rowVariants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 380, damping: 28 } },
  exit: { opacity: 0, y: 6, transition: { duration: 0.15 } },
};

const categoryVariants = {
  hidden: { opacity: 0, height: 0, overflow: "hidden" },
  visible: { opacity: 1, height: "auto", overflow: "visible", transition: { type: "spring", stiffness: 300, damping: 30 } },
  exit: { opacity: 0, height: 0, overflow: "hidden", transition: { duration: 0.2 } },
};

// ---------- sub-components ----------

interface PermissionRowProps {
  permission: Permission;
  isPending: boolean;
  isReadOnly: boolean;
  onToggle: (id: string) => void;
}

function PermissionRow({ permission, isPending, isReadOnly, onToggle }: PermissionRowProps) {
  const t = useTranslations("permissions");
  const disabled = isReadOnly || isPending;
  return (
    <motion.div
      key={permission.id}
      variants={rowVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-busy={isPending}
      className="flex items-center justify-between py-3 border-b border-[#F5F5F5] last:border-0"
    >
      <div className="flex flex-col gap-0.5 flex-1 mr-4">
        <span className="text-sm font-semibold text-[#0A0A0A]">{permission.name}</span>
        <span className="text-xs text-[#6B6B6B]">{permission.description}</span>
      </div>

      <div className="flex items-center gap-2.5">
        {isPending && (
          <>
            <Spinner size="sm" className="h-3.5 w-3.5 text-[#4a6fa5]" />
            <span className="sr-only" role="status">
              {t("updating")}
            </span>
          </>
        )}
        <label className="relative flex items-center cursor-pointer select-none">
          <input
            type="checkbox"
            aria-label={permission.name}
            checked={permission.granted}
            disabled={disabled}
            onChange={() => onToggle(permission.id)}
            className="sr-only peer"
          />
          <div
            className={[
              "w-10 h-6 rounded-full transition-colors duration-200",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-[#4a6fa5] peer-focus-visible:ring-offset-2",
              permission.granted ? "bg-[#4a6fa5]" : "bg-[#E8E8E8]",
              disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
            ].join(" ")}
          >
            <motion.div
              className="absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm"
              animate={{ left: permission.granted ? "22px" : "4px" }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </div>
        </label>
      </div>
    </motion.div>
  );
}

interface CategorySectionProps {
  category: Permission["category"];
  items: Permission[];
  isExpanded: boolean;
  pendingIds: Set<string>;
  isReadOnly: boolean;
  label: string;
  onToggleCategory: (category: string) => void;
  onTogglePermission: (id: string) => void;
}

function CategorySection({
  category,
  items,
  isExpanded,
  pendingIds,
  isReadOnly,
  label,
  onToggleCategory,
  onTogglePermission,
}: CategorySectionProps) {
  return (
    <div className="border border-[#E8E8E8] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => onToggleCategory(category)}
        aria-controls={`category-${category}`}
        aria-expanded={isExpanded}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-[#F9F9F9] hover:bg-[#F3F3F3] transition-colors"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-[#0A0A0A]">
          {label}
        </span>
        <motion.svg
          className="h-4 w-4 text-[#6B6B6B]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.section
            id={`category-${category}`}
            role="region"
            aria-label={label}
            variants={categoryVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="px-5"
          >
            <AnimatePresence initial={false}>
              {items.map((p) => (
                <PermissionRow
                  key={p.id}
                  permission={p}
                  isPending={pendingIds.has(p.id)}
                  isReadOnly={isReadOnly}
                  onToggle={onTogglePermission}
                />
              ))}
            </AnimatePresence>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- main component ----------

export function UserPermissionsManagerClient({
  userId: _userId,
  showCategories = false,
  isReadOnly = false,
  onPermissionsChange,
}: UserPermissionsManagerProps) {
  const t = useTranslations("permissions");
  const { permissions, setPermissions, isHydrated } = usePermissionsStore();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(CATEGORY_ORDER)
  );

  const handleToggle = useCallback(
    async (permissionId: string) => {
      if (isReadOnly || pendingIds.has(permissionId)) return;

      const previous = permissions.map((p: Permission) => ({ ...p }));
      const updated = permissions.map((p: Permission) =>
        p.id === permissionId
          ? { ...p, granted: !p.granted, lastModified: new Date().toISOString() }
          : p
      );

      setPermissions(updated);
      setPendingIds((ids: Set<string>) => new Set(ids).add(permissionId));

      try {
        await onPermissionsChange?.(updated);
        toast.success(t("updateSuccess"));
      } catch {
        setPermissions(previous);
        toast.error(t("updateError"));
      } finally {
        setPendingIds((ids: Set<string>) => {
          const next = new Set(ids);
          next.delete(permissionId);
          return next;
        });
      }
    },
    [isReadOnly, pendingIds, permissions, setPermissions, onPermissionsChange, t]
  );

  const handleToggleCategory = useCallback((category: string) => {
    setExpandedCategories((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  if (!isHydrated) {
    return <UserPermissionsManagerSkeleton loadingLabel={t("loading")} />;
  }

  return (
    <section
      role="region"
      aria-label={t("manager")}
      aria-busy={pendingIds.size > 0}
      className="flex flex-col gap-4"
    >
      {isReadOnly && (
        <p className="text-xs font-semibold text-[#6B6B6B] bg-[#F9F9F9] border border-[#E8E8E8] rounded-lg px-4 py-2.5">
          {t("readOnlyNotice")}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {showCategories ? (
          CATEGORY_ORDER.map((category) => {
            const items = permissions.filter((p: Permission) => p.category === category);
            if (items.length === 0) return null;
            return (
              <CategorySection
                key={category}
                category={category}
                items={items}
                isExpanded={expandedCategories.has(category)}
                pendingIds={pendingIds}
                isReadOnly={isReadOnly}
                label={t(`category.${category}`)}
                onToggleCategory={handleToggleCategory}
                onTogglePermission={handleToggle}
              />
            );
          })
        ) : (
          <AnimatePresence initial={false}>
            {permissions.map((p: Permission) => (
              <PermissionRow
                key={p.id}
                permission={p}
                isPending={pendingIds.has(p.id)}
                isReadOnly={isReadOnly}
                onToggle={handleToggle}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}

// ---------- loading state ----------

function UserPermissionsManagerSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <section
      role="region"
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col gap-4 animate-pulse"
    >
      <span className="sr-only" role="status">
        {loadingLabel}
      </span>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between py-3 border-b border-[#F5F5F5] last:border-0"
        >
          <div className="flex flex-col gap-2 flex-1 mr-4">
            <div className="h-3.5 w-32 rounded bg-[#EDEDED]" />
            <div className="h-3 w-48 rounded bg-[#F2F2F2]" />
          </div>
          <div className="h-6 w-10 rounded-full bg-[#EDEDED]" />
        </div>
      ))}
    </section>
  );
}

export default UserPermissionsManagerClient;
