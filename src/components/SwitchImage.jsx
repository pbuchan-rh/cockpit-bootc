import cockpit from 'cockpit';
import React, { useState } from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { ClipboardCopy } from "@patternfly/react-core/dist/esm/components/ClipboardCopy/index.js";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput/index.js";
import { isSafeUrl } from '../lib/url-safety.js';

const _ = cockpit.gettext;

// Deliberately permissive — just enough to catch obvious typos (empty,
// whitespace, no registry/repo separator at all) before wasting a skopeo
// call. Real validation happens when Preview actually queries the registry.
function looksLikeImageRef(value) {
    const trimmed = value.trim();
    return trimmed.length > 0 && !/\s/.test(trimmed) && trimmed.includes('/');
}

export const SwitchImage = ({
    switching,
    disabled,
    switchDisabled,
    onSwitch,
    previewing,
    preview,
    previewError,
    onPreview,
    onDismissPreview,
    onRefChange,
}) => {
    const [ref, setRef] = useState('');

    function updateRef(value) {
        setRef(value);
        if (onRefChange) onRefChange(value);
    }

    return (
        <>
                <Flex alignItems={{ default: 'alignItemsCenter' }} className="ct-switch-row">
                    <FlexItem>
                        <label htmlFor="switch-image-ref" className="ct-switch-label">{_("Track a different image:")}</label>
                    </FlexItem>
                    <FlexItem grow={{ default: 'grow' }}>
                        <TextInput
                            id="switch-image-ref"
                            type="text"
                            value={ref}
                            onChange={(_event, value) => updateRef(value)}
                            onKeyDown={event => {
                                if (event.key === 'Enter' && !disabled && !previewing && looksLikeImageRef(ref)) {
                                    event.preventDefault();
                                    onPreview(ref);
                                }
                            }}
                            placeholder={_("registry.example.com/namespace/image:tag")}
                            aria-label={_("Image reference")}
                        />
                    </FlexItem>
                    <FlexItem>
                        <Button
                            variant="secondary"
                            onClick={() => (preview || previewError) ? onDismissPreview() : onPreview(ref)}
                            isDisabled={disabled || previewing || (!(preview || previewError) && !looksLikeImageRef(ref))}
                            isLoading={previewing}
                        >
                            {previewing ? _("Inspecting…") : (preview || previewError) ? _("Hide Inspection") : _("Inspect")}
                        </Button>
                    </FlexItem>
                    <FlexItem>
                        <Button
                            variant={preview ? "primary" : "secondary"}
                            onClick={() => onSwitch(ref)}
                            isDisabled={disabled || switchDisabled || switching || !ref.trim() || !preview}
                            isLoading={switching}
                        >
                            {switching ? _("Switching…") : _("Switch")}
                        </Button>
                    </FlexItem>
                </Flex>

                {previewError && (
                    <p className="ct-switch-preview-error">{cockpit.format(_("Could not inspect image: $0"), previewError)}</p>
                )}

                {preview && !previewError && (
                    <div className="ct-switch-preview-block">
                    <DescriptionList isCompact isHorizontal className="ct-switch-preview">
                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("Version")}</DescriptionListTerm>
                            <DescriptionListDescription>{preview.version || _("Unknown")}</DescriptionListDescription>
                        </DescriptionListGroup>
                        {preview.rhelVersion && (
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("RHEL version")}</DescriptionListTerm>
                                <DescriptionListDescription>{preview.rhelVersion}</DescriptionListDescription>
                            </DescriptionListGroup>
                        )}
                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("Digest")}</DescriptionListTerm>
                            <DescriptionListDescription>
                                <ClipboardCopy
                                    isReadOnly isCode truncation
                                    hoverTip={_("Copy")} clickTip={_("Copied")}
                                    variant="inline-compact"
                                >
                                    {preview.digest}
                                </ClipboardCopy>
                            </DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("Created")}</DescriptionListTerm>
                            <DescriptionListDescription>
                                {preview.created ? new Date(preview.created).toLocaleString() : _("Unknown")}
                            </DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("Architecture")}</DescriptionListTerm>
                            <DescriptionListDescription>{preview.architecture || _("Unknown")}</DescriptionListDescription>
                        </DescriptionListGroup>
                        {preview.alsoTagged?.length > 0 && (
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Also tagged")}</DescriptionListTerm>
                                <DescriptionListDescription>{preview.alsoTagged.join(", ")}</DescriptionListDescription>
                            </DescriptionListGroup>
                        )}
                        {preview.source && (
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Base image source")}</DescriptionListTerm>
                                <DescriptionListDescription>
                                    {isSafeUrl(preview.source)
                                        ? <a href={preview.source} target="_blank" rel="noopener noreferrer">{preview.source}</a>
                                        : preview.source}
                                    {preview.revision && <> @ <code>{preview.revision.slice(0, 12)}</code></>}
                                </DescriptionListDescription>
                            </DescriptionListGroup>
                        )}
                    </DescriptionList>
                    </div>
                )}
        </>
    );
};
