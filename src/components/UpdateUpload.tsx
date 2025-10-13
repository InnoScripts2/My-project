import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Upload, FileArchive } from 'lucide-react';
import { useUpdates } from '@/hooks/useUpdates';
import { toast } from 'sonner';

export const UpdateUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const [description, setDescription] = useState('');
  const [changelog, setChangelog] = useState('');
  const [isMandatory, setIsMandatory] = useState(false);
  const [publishNow, setPublishNow] = useState(false);

  const { uploadUpdate } = useUpdates();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/zip': ['.zip'] },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setFile(acceptedFiles[0]);
        // Try to extract version from filename
        const filename = acceptedFiles[0].name.replace('.zip', '');
        if (!version) {
          setVersion(filename);
        }
      }
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      toast.error('Please select a file');
      return;
    }

    if (!version.trim()) {
      toast.error('Version is required');
      return;
    }

    uploadUpdate.mutate({
      file,
      version: version.trim(),
      description: description.trim(),
      changelog: changelog.trim(),
      isMandatory,
      targetClients: [], // All clients by default
      publishNow,
    });

    // Reset form
    setFile(null);
    setVersion('');
    setDescription('');
    setChangelog('');
    setIsMandatory(false);
    setPublishNow(false);
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Upload New Update</h1>

      <Card className="bg-secondary border-border max-w-3xl">
        <CardHeader>
          <CardTitle>Update Package</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* File Drop Zone */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-[#007acc] bg-[#007acc]/10'
                  : 'border-border hover:border-[#007acc]/50'
              }`}
            >
              <input {...getInputProps()} />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileArchive className="h-8 w-8 text-[#007acc]" />
                  <div className="text-left">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="text-lg">
                    {isDragActive ? 'Drop the file here' : 'Drag & drop .zip file here'}
                  </p>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                </div>
              )}
            </div>

            {/* Version */}
            <div className="space-y-2">
              <Label htmlFor="version">Version *</Label>
              <Input
                id="version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                required
                className="bg-background"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this update..."
                rows={3}
                className="bg-background"
              />
            </div>

            {/* Changelog */}
            <div className="space-y-2">
              <Label htmlFor="changelog">Changelog (Markdown)</Label>
              <Textarea
                id="changelog"
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
                placeholder="## What's New&#10;- Feature 1&#10;- Bug fix 2"
                rows={6}
                className="bg-background font-mono text-sm"
              />
            </div>

            {/* Options */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="mandatory"
                  checked={isMandatory}
                  onCheckedChange={(checked) => setIsMandatory(checked as boolean)}
                />
                <Label htmlFor="mandatory" className="cursor-pointer">
                  Mandatory Update
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="publish"
                  checked={publishNow}
                  onCheckedChange={(checked) => setPublishNow(checked as boolean)}
                />
                <Label htmlFor="publish" className="cursor-pointer">
                  Publish Immediately
                </Label>
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={!file || uploadUpdate.isPending}
              className="w-full"
            >
              {uploadUpdate.isPending ? 'Uploading...' : 'Upload Update'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
