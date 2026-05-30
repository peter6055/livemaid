"use client";

import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, FileEdit, Trash2, Clock, GitCommitVertical } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';
import mermaid from 'mermaid';
import { Badge } from '@/components/ui/badge';
import { determineDiagramType } from '@/lib/diagrams/utils';

export interface DiagramDocument {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  type: string;
  code?: string;
}

export function DiagramCard({ 
  diagram, 
  onRename, 
  onDelete,
  onNavigate
}: { 
  diagram: DiagramDocument, 
  onRename: (id: string, name: string) => void,
  onDelete: (id: string) => void,
  onNavigate: (url: string) => void
}) {
  const [svgContent, setSvgContent] = useState<string>('');

  useEffect(() => {
    if (diagram.code) {
      const renderPreview = async () => {
        try {
          mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', flowchart: { htmlLabels: false } });
          await mermaid.parse(diagram.code!, { suppressErrors: true });
          const { svg } = await mermaid.render(`preview-${diagram.id}`, diagram.code!);
          setSvgContent(svg);
        } catch (e) {
          // invalid syntax, don't render bomb error
          setSvgContent('');
        }
      };
      renderPreview();
    }
  }, [diagram.code, diagram.id]);

  const parsedType = diagram.code ? determineDiagramType(diagram.code) : diagram.type;
  const isSupported = parsedType === 'graph' || parsedType === 'flowchart' || parsedType === 'sequence';

  return (
    <Card className="flex flex-col h-full bg-background border-border hover:border-accent-foreground/30 hover:shadow-sm transition-all group">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg font-medium text-foreground truncate pr-2">
            {diagram.name}
          </CardTitle>
          <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent" onClick={() => onRename(diagram.id, diagram.name)}>
              <FileEdit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-400/10" onClick={() => onDelete(diagram.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center text-xs text-muted-foreground mt-1">
           <GitCommitVertical className="h-3 w-3 mr-1" />
           <span className="capitalize mr-2">{parsedType}</span>
           {!isSupported && (
             <Badge variant="outline" className="px-1.5 py-0 h-5 bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold">
               Code Edit Only
             </Badge>
           )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow">
        <a href={`/editor/${diagram.id}`} onClick={(e) => { e.preventDefault(); onNavigate(`/editor/${diagram.id}`); }}>
          <div className="w-full h-32 bg-slate-50 rounded-md border border-border flex items-center justify-center cursor-pointer group-hover:border-accent-foreground/30 transition-colors overflow-hidden relative">
            {svgContent ? (
               <div dangerouslySetInnerHTML={{ __html: svgContent }} className="w-full h-full object-contain flex items-center justify-center opacity-70 pointer-events-none transform scale-50 text-zinc-900" />
            ) : (
               <span className="text-zinc-500 text-xs font-medium">Preview Unavailable</span>
            )}
          </div>
        </a>
      </CardContent>
      <CardFooter className="pt-3 border-t border-border text-xs text-muted-foreground flex items-center mt-2">
        <Clock className="h-3 w-3 mr-1" />
        Edited {formatDistanceToNow(new Date(diagram.updatedAt), { addSuffix: true })}
      </CardFooter>
    </Card>
  );
}
