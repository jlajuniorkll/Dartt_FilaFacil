'use client';

import type { AppSettings, ButtonConfig } from '@/lib/types';
import { useState, useTransition } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { updateSettings } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CardContent, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Trash, PlusCircle, GripVertical } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

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
    })
  ),
  youtubeUrls: z.array(z.object({ value: z.string().url('URL inválida') })),
  counterConfiguration: z.enum(['none', 'random', 'selectable']),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function SettingsClient({ initialSettings }: { initialSettings: AppSettings }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      ...initialSettings,
      buttons: initialSettings.buttons.map(b => ({...b, priority: Number(b.priority), frequency: Number(b.frequency)})),
      youtubeUrls: initialSettings.youtubeUrls.map(url => ({ value: url })),
      counterConfiguration: initialSettings.counterConfiguration || 'none',
    },
  });

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
      };
      const result = await updateSettings(formattedData);
      if (result.success) {
        toast({
          title: 'Sucesso!',
          description: 'Configurações salvas no Firebase.',
        });
      } else {
        toast({
          title: 'Erro',
          description: result.error || 'Não foi possível salvar as configurações.',
          variant: 'destructive',
        });
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <CardContent className="space-y-8">
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
            <Button type="button" variant="outline" onClick={() => appendButton({ id: `btn-${Date.now()}`, name: '', prefix: '', priority: buttonFields.length + 1, frequency: 1, color: '#000000', textColor: '#FFFFFF' })}>
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

          {/* Counter Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium font-headline">Configuração de Guichês</h3>
            <Separator />
            <FormField
              control={form.control}
              name="counterConfiguration"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Modo de chamada do guichê</FormLabel>
                   <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="grid grid-cols-1 md:grid-cols-3 gap-2"
                    >
                      <FormItem>
                        <Label
                          htmlFor="none"
                          className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer"
                          data-state={field.value === 'none' ? 'checked' : 'unchecked'}
                        >
                          <RadioGroupItem value="none" id="none" className="sr-only" />
                          Não configurar guichês
                        </Label>
                      </FormItem>
                      <FormItem>
                         <Label
                          htmlFor="random"
                          className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer"
                          data-state={field.value === 'random' ? 'checked' : 'unchecked'}
                        >
                          <RadioGroupItem value="random" id="random" className="sr-only" />
                          Guichês Aleatórios
                        </Label>
                      </FormItem>
                       <FormItem>
                        <Label
                          htmlFor="selectable"
                           className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer"
                           data-state={field.value === 'selectable' ? 'checked' : 'unchecked'}
                        >
                           <RadioGroupItem value="selectable" id="selectable" className="sr-only" />
                          Guichês Selecionáveis
                        </Label>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
  );
}
