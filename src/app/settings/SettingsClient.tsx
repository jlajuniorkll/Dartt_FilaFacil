
'use client';

import type { AppSettings, ButtonConfig } from '@/lib/types';
import { useState, useTransition } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { updateSettings, resetQueue, resetSequenceCounters } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Trash, PlusCircle, GripVertical, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

const settingsSchema = z.object({
  priorityEnabled: z.boolean(),
  buttons: z.array(
    z.object({
      id: z.string(),
      name: z.string().min(1, 'Nome é obrigatório'),
      prefix: z.string().min(1, 'Prefixo é obrigatório').max(3, 'Máximo de 3 caracteres'),
      priority: z.coerce.number().min(1, 'Prioridade deve ser no mínimo 1'),
      frequency: z.coerce.number().min(1, 'Frequência deve ser no mínimo 1'),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida'),
      textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida'),
      automaticNumbering: z.boolean().default(true),
      startNumber: z.coerce.number().min(1, 'O número inicial deve ser no mínimo 1.').optional(),
      associatedCounters: z.string().optional(),
    })
  ),
  youtubeUrls: z.array(z.object({ value: z.string().url('URL inválida') })),
  totalCounters: z.coerce.number().min(0, 'O número de guichês não pode ser negativo.'),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function SettingsClient({ initialSettings, onSettingsChange }: { initialSettings: AppSettings, onSettingsChange: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isResettingQueue, setIsResettingQueue] = useState(false);
  const [isResettingSequence, setIsResettingSequence] = useState(false);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      ...initialSettings,
      buttons: initialSettings.buttons.map(b => ({
        ...b,
        priority: Number(b.priority),
        frequency: Number(b.frequency),
        automaticNumbering: b.automaticNumbering ?? true,
        startNumber: b.startNumber || 1,
        associatedCounters: b.associatedCounters || ''
      })),
      youtubeUrls: initialSettings.youtubeUrls.map(url => ({ value: url })),
      totalCounters: initialSettings.totalCounters || 0,
    },
  });
  
  const watchedButtons = form.watch('buttons');

  const { fields: buttonFields, append: appendButton, remove: removeButton } = useFieldArray({
    control: form.control,
    name: 'buttons',
  });

  const { fields: urlFields, append: appendUrl, remove: removeUrl } = useFieldArray({
    control: form.control,
    name: 'youtubeUrls',
  });
  
  const onSubmit = (data: SettingsFormValues) => {
    startTransition(async () => {
      const formattedData: AppSettings = {
        ...data,
        youtubeUrls: data.youtubeUrls.map(urlObj => urlObj.value),
        counterConfiguration: 'none',
        buttons: data.buttons.map(b => ({
          ...b,
          startNumber: b.startNumber || 1
        })),
      };
      const result = await updateSettings(formattedData);
      if (result.success) {
        toast({
          title: 'Sucesso!',
          description: 'Configurações salvas.',
        });
        onSettingsChange(); // Refresh parent page
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Não foi possível salvar as configurações.',
          variant: 'destructive',
        });
      }
    });
  };
  
  const handleResetQueue = () => {
    setIsResettingQueue(true);
    startTransition(async () => {
       const result = await resetQueue();
        if (result.success) {
            toast({
                title: 'Fila Reiniciada!',
                description: 'Todas as senhas de hoje foram removidas e os contadores zerados.',
            });
            onSettingsChange(); // Refresh parent page
        } else {
            toast({
                title: 'Erro ao Reiniciar',
                description: result.error || 'Não foi possível zerar a fila.',
                variant: 'destructive',
            });
        }
        setIsResettingQueue(false);
    });
  }

  const handleResetSequence = () => {
    setIsResettingSequence(true);
    startTransition(async () => {
       const result = await resetSequenceCounters();
        if (result.success) {
            toast({
                title: 'Sequência Reiniciada!',
                description: 'A numeração para as próximas senhas foi reiniciada.',
            });
            onSettingsChange();
        } else {
            toast({
                title: 'Erro ao Reiniciar Sequência',
                description: result.error || 'Não foi possível zerar a sequência de numeração.',
                variant: 'destructive',
            });
        }
        setIsResettingSequence(false);
    });
  }


  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-8">
            {/* Counter Configuration */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium font-headline">Configuração de Guichês</h3>
              <Separator />
              <FormField
                control={form.control}
                name="totalCounters"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número Total de Guichês</FormLabel>
                    <FormControl><Input type="number" {...field} min={0} /></FormControl>
                    <FormDescription>
                      O número total de guichês de atendimento disponíveis. Isso será usado na tela de chamada.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
            </div>

            {/* Button Configuration */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium font-headline">Tipos de Senha</h3>
              <Separator />
              {buttonFields.map((field, index) => (
                <div key={field.id} className="p-4 border rounded-lg space-y-4 relative bg-card">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name={`buttons.${index}.name`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do Botão</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name={`buttons.${index}.prefix`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prefixo</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name={`buttons.${index}.priority`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prioridade</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name={`buttons.${index}.frequency`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Frequência</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                     <div className="md:col-span-2 space-y-4">
                        <FormField
                            control={form.control}
                            name={`buttons.${index}.automaticNumbering`}
                            render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                <div className="space-y-0.5">
                                <FormLabel>Numeração Automática (inicia em 1)</FormLabel>
                                <FormDescription>
                                    Se ativo, a contagem reinicia em 1 todo dia. Se inativo, usa o número inicial definido abaixo.
                                </FormDescription>
                                </div>
                                <FormControl>
                                <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                                </FormControl>
                            </FormItem>
                            )}
                        />
                        {watchedButtons[index] && !watchedButtons[index].automaticNumbering && (
                           <FormField control={form.control} name={`buttons.${index}.startNumber`} render={({ field }) => (
                            <FormItem>
                              <FormLabel>Número Inicial Personalizado</FormLabel>
                              <FormControl><Input type="number" min="1" {...field} /></FormControl>
                               <FormDescription>A contagem de senhas deste tipo iniciará neste número a cada dia.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )} />
                        )}
                    </div>
                    
                    <FormField control={form.control} name={`buttons.${index}.color`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor do Botão</FormLabel>
                        <FormControl><Input type="color" {...field} className="h-10 p-1"/>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name={`buttons.${index}.textColor`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor do Texto</FormLabel>
                        <FormControl><Input type="color" {...field} className="h-10 p-1"/>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <Button type="button" variant="destructive" size="sm" onClick={() => removeButton(index)}>
                    <Trash className="mr-2 h-4 w-4" /> Remover Tipo
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={() => appendButton({ id: `btn-${Date.now()}`, name: '', prefix: '', priority: buttonFields.length + 1, frequency: 1, automaticNumbering: true, startNumber: 1, color: '#5DADE2', textColor: '#FFFFFF', associatedCounters: '' })}>
                <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Tipo de Senha
              </Button>
            </div>

            {/* YouTube URLs */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium font-headline">Vídeos do YouTube</h3>
              <Separator />
              {urlFields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <GripVertical className="h-5 w-5 text-muted-foreground" />
                  <FormField control={form.control} name={`youtubeUrls.${index}.value`} render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl><Input {...field} placeholder="https://www.youtube.com/watch?v=..." /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeUrl(index)}>
                    <Trash className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={() => appendUrl({ value: '' })}>
                <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Vídeo
              </Button>
            </div>
            
            {/* Priority Switch */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium font-headline">Sistema de Prioridade</h3>
              <Separator />
              <FormField control={form.control} name="priorityEnabled" render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Ativar Chamada por Prioridade</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Se ativo, o botão "Chamar Próximo" seguirá as regras de prioridade. Se inativo, botões individuais serão exibidos.
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )} />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          </CardFooter>
        </form>
      </Form>
      
      {/* Danger Zone */}
      <CardHeader>
        <CardTitle className="text-destructive font-headline">Zona de Perigo</CardTitle>
        <CardDescription>Ações nesta seção são permanentes e não podem ser desfeitas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-destructive/50 p-4">
            <div className="space-y-1">
                <h4 className="font-semibold">Zerar a Fila</h4>
                <p className="text-sm text-muted-foreground">Isso removerá todas as senhas emitidas e chamadas <span className="font-bold">hoje</span>. A contagem será reiniciada.</p>
            </div>
             <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isResettingQueue}>
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    {isResettingQueue ? 'Zerando...' : 'Zerar Fila Atual'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. Isso limpará permanentemente a fila do dia atual, incluindo o histórico de chamadas e senhas pendentes.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetQueue} disabled={isResettingQueue}>
                    Sim, zerar a fila
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
         </div>

         <div className="flex items-center justify-between rounded-lg border border-destructive/50 p-4">
            <div className="space-y-1">
                <h4 className="font-semibold">Zerar Sequência de Numeração</h4>
                <p className="text-sm text-muted-foreground">Isso reiniciará os contadores para as <span className="font-bold">próximas</span> senhas, sem apagar as já geradas.</p>
            </div>
             <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isResettingSequence}>
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    {isResettingSequence ? 'Zerando...' : 'Zerar Sequências'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. A numeração para os próximos tickets de cada tipo será reiniciada (para 1 ou para o número inicial configurado). As senhas já na fila não serão afetadas.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetSequence} disabled={isResettingSequence}>
                    Sim, zerar sequências
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
         </div>
      </CardContent>
    </>
  );
}
