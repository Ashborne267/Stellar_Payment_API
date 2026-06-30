"use client";

import { BellIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";

export default function NotificationCenter() {
  const { notifications, unreadCount, isOpen, toggleOpen, handleDismiss } =
    useNotificationCenter();

  return (
    <div className="relative">
      <motion.button
        onClick={toggleOpen}
        className="relative flex items-center justify-center p-2.5 rounded-lg border border-[#E8E8E8] bg-white text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-[#F5F5F5] transition-all min-h-[44px] min-w-[44px]"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <BellIcon className="h-5 w-5" aria-hidden="true" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute top-2 right-2 flex h-2 w-2"
              aria-hidden="true"
            >
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F5D4] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F5D4] border border-black shadow-[0_0_8px_#00F5D4]" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute right-0 mt-4 w-80 max-h-[32rem] overflow-y-auto rounded-lg border border-[#E8E8E8] bg-white shadow-xl z-50 p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Notification Center"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[10px] font-bold text-[#0A0A0A] uppercase tracking-widest">
                Notifications
              </h3>
              <span
                className="text-[10px] font-medium text-[#6B6B6B] bg-[#F5F5F5] px-2 py-1 rounded"
                aria-live="polite"
                aria-atomic="true"
              >
                {unreadCount} unread
              </span>
            </div>

            <div
              className="flex flex-col gap-3"
              role="list"
              aria-label="Notification list"
            >
              <AnimatePresence mode="popLayout">
                {notifications.length === 0 ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-[11px] font-black text-[#A0A0A0] uppercase tracking-widest text-center py-8"
                    role="status"
                  >
                    No new alerts
                  </motion.p>
                ) : (
                  notifications.map((notif, index) => (
                    <motion.div
                      key={notif.id || index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20, scale: 0.9 }}
                      transition={{ delay: index * 0.05, duration: 0.2 }}
                      className="rounded-lg bg-[#F9F9F9] border border-[#E8E8E8] p-4 hover:bg-[#F0F0F0] group relative"
                      role="listitem"
                      aria-label={`Notification: ${notif.message}`}
                    >
                      <button
                        onClick={() => notif.id && handleDismiss(notif.id)}
                        className="absolute top-2 right-2 p-1 rounded hover:bg-[#E8E8E8] opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={`Dismiss notification: ${notif.message}`}
                      >
                        <XMarkIcon className="h-4 w-4 text-[#6B6B6B]" aria-hidden="true" />
                      </button>
                      <p className="text-[10px] font-bold text-[#0A0A0A] uppercase tracking-widest mb-1">
                        Alert
                      </p>
                      <p className="text-xs font-medium text-[#6B6B6B] leading-relaxed pr-6">
                        {notif.message}
                      </p>
                      {notif.timestamp && (
                        <p
                          className="text-[10px] text-[#A0A0A0] mt-2"
                          aria-label={`Timestamp: ${notif.timestamp}`}
                        >
                          {new Date(notif.timestamp).toLocaleString()}
                        </p>
                      )}
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
