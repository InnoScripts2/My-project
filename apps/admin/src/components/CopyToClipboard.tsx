import { useState } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { IconCopy, IconCheck } from '@tabler/icons-react';

interface CopyToClipboardProps {
  text: string;
  label?: string;
}

export default function CopyToClipboard({ text, label = 'Копировать' }: CopyToClipboardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <Tooltip title={copied ? 'Скопировано!' : label}>
      <IconButton size="small" onClick={handleCopy}>
        {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
      </IconButton>
    </Tooltip>
  );
}
