"use client";

import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, FileEdit, Trash2, Clock, GitCommitVertical } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';
import mermaid from 'mermaid';

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
  onDelete 
}: { 
  diagram: DiagramDocument, 
  onRename: (id: string, name: string) => void,
  onDelete: (id: string) => void 
}) {
  const [svgContent, setSvgContent] = useState<string>('');

  useEffect(() => {
    if (diagram.code) {
      const renderPreview = async () => {
        try {
          mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', flowchart: { htmlLabels: false }, sequence: { htmlLabels: false } });
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

  return (
    <Card className="flex flex-col h-full bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all group">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg font-medium text-zinc-900 truncate pr-2">
            {diagram.name}
          </CardTitle>
          <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-zinc-900 hover:bg-slate-100" onClick={() => onRename(diagram.id, diagram.name)}>
              <FileEdit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-400/10" onClick={() => onDelete(diagram.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center text-xs text-slate-500 mt-1">
           <GitCommitVertical className="h-3 w-3 mr-1" />
           <span className="capitalize">{diagram.type}</span>
        </div>
      </CardHeader>
      <CardContent className="flex-grow">
        <Link href={`/editor/${diagram.id}`}>
          <div className="w-full h-32 bg-slate-50 rounded-md border border-slate-100 flex items-center justify-center cursor-pointer group-hover:border-slate-200 transition-colors overflow-hidden relative">
            {svgContent ? (
               <div dangerouslySetInnerHTML={{ __html: svgContent }} className="w-full h-full object-contain flex items-center justify-center opacity-70 pointer-events-none transform scale-50" />
            ) : (
               <span className="text-slate-400 text-sm font-medium">Preview Unavailable</span>
            )}
          </div>
        </Link>
      </CardContent>
      <CardFooter className="pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center mt-2">
        <Clock className="h-3 w-3 mr-1" />
        Edited {formatDistanceToNow(new Date(diagram.updatedAt), { addSuffix: true })}
      </CardFooter>
    </Card>
  );
}
