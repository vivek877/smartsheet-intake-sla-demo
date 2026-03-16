import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * ContactMultiSelect Component
 * 
 * An enterprise-grade, accessible multi-select dropdown designed for team member assignment.
 * Supports keyword filtering, keyboard navigation (ARROWS/ENTER/ESC), and visual indicators.
 * 
 * @param {Object[]} props.contacts - List of available contacts [{ name, email, color }]
 * @param {string[]} props.value - Array of selected contact emails
 * @param {Function} props.onChange - Callback function for selection changes
 * @param {string} props.placeholder - Placeholder text when no contacts are selected
 */
export default function ContactMultiSelect({ 
  contacts = [], 
  value = [], 
  onChange, 
  placeholder = 'Select assignees…' 
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  
  const boxRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const selectedEmails = Array.isArray(value) ? value : (value ? [value] : []);

  // Standard click-outside detection for dropdown dismissal
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Filtered contact list based on user input
  const filteredContacts = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter(c =>
      c.name.toLowerCase().includes(term) ||
      (c.email || '').toLowerCase().includes(term)
    );
  }, [searchQuery, contacts]);

  // Focus management when dropdown opens
  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const toggleDropdown = () => setOpen((prev) => !prev);

  /**
   * Toggles selection state for a specific contact.
   */
  function handleSelectToggle(email) {
    if (!onChange) return;
    const isSelected = selectedEmails.includes(email);
    const updatedSelection = isSelected 
      ? selectedEmails.filter(v => v !== email) 
      : [...selectedEmails, email];
    onChange(updatedSelection);
  }

  /**
   * Handles keyboard navigation and accessibility events.
   */
  function handleKeyDown(e) {
    if (!open) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filteredContacts.length - 1));
        syncScrollState(activeIndex + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        syncScrollState(activeIndex - 1);
        break;
      case 'Enter':
        e.preventDefault();
        const pick = filteredContacts[activeIndex];
        if (pick) handleSelectToggle(pick.email);
        break;
      case 'Escape':
        setOpen(false);
        break;
      default:
        break;
    }
  }

  /**
   * Synchronizes scroll position with active keyboard selection.
   */
  function syncScrollState(idx) {
    const container = listRef.current;
    if (!container) return;
    const item = container.querySelector(`[data-index="${idx}"]`);
    if (item) {
      const cTop = container.scrollTop;
      const cBottom = cTop + container.clientHeight;
      const iTop = item.offsetTop;
      const iBottom = iTop + item.offsetHeight;

      if (iBottom > cBottom) container.scrollTop = iBottom - container.clientHeight;
      else if (iTop < cTop) container.scrollTop = iTop;
    }
  }

  return (
    <div className="contact-selector" ref={boxRef} style={{ position: 'relative' }}>
      {/* Visual Chips Container */}
      <div className="selector-chips" onClick={toggleDropdown}>
        {selectedEmails.length === 0 && (
          <span className="placeholder-text">{placeholder}</span>
        )}
        {selectedEmails.map(email => {
          const contact = contacts.find(x => x.email === email);
          const initials = contact 
            ? contact.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() 
            : '?';
          
          return (
            <span key={email} className="contact-chip">
              <span className="chip-avatar" style={{ background: contact?.color || 'var(--muted)' }}>
                {initials}
              </span>
              <span className="chip-label">{contact ? contact.name : email}</span>
              <span className="chip-remove" onClick={(e) => { 
                e.stopPropagation(); 
                handleSelectToggle(email); 
              }}>✕</span>
            </span>
          );
        })}
        <span className="selector-caret">▾</span>
      </div>

      {/* Selection Dropdown */}
      {open && (
        <div className="selector-dropdown" onKeyDown={handleKeyDown}>
          <div className="dropdown-search">
            <span className="search-icon">🔎</span>
            <input
              ref={inputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search team members…"
            />
          </div>

          <div className="dropdown-list" ref={listRef}>
            {filteredContacts.length === 0 && (
              <div className="no-matches">No team members matched your search</div>
            )}
            {filteredContacts.map((contact, idx) => {
              const isSelected = selectedEmails.includes(contact.email);
              const initials = contact.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
              
              return (
                <div
                  key={contact.email}
                  data-index={idx}
                  onClick={() => handleSelectToggle(contact.email)}
                  className={`list-item ${idx === activeIndex ? 'item-active' : ''}`}
                >
                  <input type="checkbox" checked={isSelected} readOnly />
                  <div className="item-avatar" style={{ background: contact.color }}>
                    {initials}
                  </div>
                  <div className="item-details">
                    <div className="item-name">{contact.name}</div>
                    <div className="item-email">{contact.email}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}