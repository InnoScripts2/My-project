import { Box, Typography } from '@mui/material';

interface CodeBlockProps {
  children: string;
}

export default function CodeBlock({ children }: CodeBlockProps) {
  return (
    <Box
      sx={{
        bgcolor: 'grey.100',
        p: 2,
        borderRadius: 1,
        overflow: 'auto',
        maxHeight: 400,
      }}
    >
      <Typography
        component="pre"
        sx={{
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {children}
      </Typography>
    </Box>
  );
}
