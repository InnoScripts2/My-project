import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useUpdates } from '@/hooks/useUpdates';
import { formatDistanceToNow } from 'date-fns';
import { Package, Trash2, Send, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';

export const UpdatesList = () => {
  const { updates, isLoading, publishUpdate, deleteUpdate } = useUpdates();

  if (isLoading) {
    return <div className="p-8">Loading updates...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Updates</h1>
        <div className="text-lg text-muted-foreground">
          {updates?.length || 0} total updates
        </div>
      </div>

      <div className="grid gap-4">
        {updates?.map((update) => (
          <Card key={update.id} className="bg-secondary border-border">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Package className="h-6 w-6 text-[#007acc]" />
                  <div>
                    <CardTitle className="text-xl">Version {update.version}</CardTitle>
                    {update.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {update.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {update.is_mandatory && (
                    <Badge variant="destructive">Mandatory</Badge>
                  )}
                  {update.published_at ? (
                    <Badge className="bg-[#89d185] text-black">Published</Badge>
                  ) : (
                    <Badge variant="outline">Draft</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                <div>
                  <p className="text-muted-foreground">File Size</p>
                  <p className="font-medium">
                    {(update.file_size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Checksum</p>
                  <p className="font-mono text-xs">{update.checksum.slice(0, 16)}...</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {formatDistanceToNow(new Date(update.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Published</p>
                  <p className="font-medium">
                    {update.published_at
                      ? formatDistanceToNow(new Date(update.published_at), { addSuffix: true })
                      : 'Not published'}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                {update.changelog && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <FileText className="h-4 w-4 mr-2" />
                        View Changelog
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Changelog - Version {update.version}</DialogTitle>
                      </DialogHeader>
                      <div className="prose prose-invert max-w-none">
                        <ReactMarkdown>{update.changelog}</ReactMarkdown>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {!update.published_at && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => publishUpdate.mutate(update.id)}
                    disabled={publishUpdate.isPending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Publish Now
                  </Button>
                )}

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteUpdate.mutate(update)}
                  disabled={deleteUpdate.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {updates?.length === 0 && (
        <div className="text-center py-12">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg text-muted-foreground">No updates yet</p>
        </div>
      )}
    </div>
  );
};
