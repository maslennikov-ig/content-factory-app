const {contract,evidence,owner,imageInput,videoInput}=require('./helpers/hgg-pilot-quote-fixture.cjs');
// Exact cost-only structures observed in retained pilot15 replies; all request IDs/data are synthetic.
test.each([[imageInput,2.75],[videoInput,16.25]])('retained native fractional cost-only reply preserves both fields without inventing provider validation', (input,amount)=>{
 const request=contract.hggPilotQuoteRequestV1(input,evidence,owner);
 const raw={cost:{credits:amount,credits_exact:amount}};
 const result=contract.decodeHggPilotQuoteV1(request,raw);
 expect(result.cost).toEqual({credits:amount,creditsExact:amount});
 expect(result).toMatchObject({inputValidated:false,generationReady:false,paidSubmitEnabled:false,canSubmit:false,walletVerified:false});
 for(const field of ['providerInputCheck','prepared_params','adjustments','expiresAt','providerModelEcho','actualCost'])expect(result).not.toHaveProperty(field);
});
